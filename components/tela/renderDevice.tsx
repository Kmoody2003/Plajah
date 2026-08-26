// renderDevice — ONE device-rendering code path, shared by the TelaView canvas
// and the reference-embed (TelaEmbed). Given a device + a small context of live
// data/dispatch, it returns the right device component wired to ops. Extracted
// from TelaView (P2b) so the embed renders byte-identically to the canvas — a
// living document, not an exported flatten.

import React from 'react';
import type { TelaDevice } from '../../types';
import type { TelaOp } from './telaOps';
import type { TelaBaseLite, TelaFormulaContext } from './TelaGrid';
import TelaWriter, { type TelaWriterSelection } from './TelaWriter';
import TelaGrid from './TelaGrid';
import TelaBase from './TelaBase';
import TelaForm from './TelaForm';
import TelaVector from './TelaVector';
import TelaImage from './TelaImage';
import TelaNotes from './TelaNotes';
import { auth } from '../../services/firebase';

/** Everything renderDevice needs that isn't the device itself. */
export interface RenderDeviceCtx {
  /** All devices in the doc (Form looks up its Base by id). */
  devices: Record<string, TelaDevice>;
  /** Mutations — the reducer stream. */
  dispatchOp: (op: TelaOp) => void;
  /** Live plain text of every Writer (Vector TEXT bound to a Writer reads this). */
  writerTexts: Record<string, string>;
  /** Writers available to bind a Vector TEXT object to. */
  writers: { id: string; name: string }[];
  /** Bases available to a Form. */
  bases: { id: string; name: string }[];
  /** Cross-device formula resolution for Grid. */
  formulaContext: TelaFormulaContext;
  /** Id factory (Form submit → new Base row). */
  uid: (p: string) => string;
  /** Authoring-only selection bridge used by the Assignment Builder. */
  onWriterSelection?: (selection: TelaWriterSelection | null) => void;
  onWriterInteraction?: (selection: TelaWriterSelection, kind: 'QUESTION' | 'INSTRUCTION') => void;
}

/**
 * Render a single device. When `readOnly`, editing chrome is suppressed and the
 * device is display-only — the embed's default, and the print path's default.
 */
export function renderDevice(device: TelaDevice, ctx: RenderDeviceCtx, readOnly = false): React.ReactNode {
  const { devices, dispatchOp, writerTexts, writers, bases, formulaContext, uid, onWriterSelection, onWriterInteraction } = ctx;

  if (device.type === 'WRITER') {
    return (
      <TelaWriter
        key={device.id}
        device={device}
        readOnly={readOnly}
        onSelectionChange={onWriterSelection}
        onTurnSelectionInto={onWriterInteraction}
        onChangeBlocks={blocks => dispatchOp({ type: 'SET_WRITER_BLOCKS', deviceId: device.id, blocks })}
      />
    );
  }
  if (device.type === 'BASE') {
    return (
      <TelaBase
        key={device.id}
        device={device}
        readOnly={readOnly}
        onAddField={field => dispatchOp({ type: 'ADD_BASE_FIELD', deviceId: device.id, field })}
        onUpdateField={(fieldId, patch) => dispatchOp({ type: 'UPDATE_BASE_FIELD', deviceId: device.id, fieldId, patch })}
        onDeleteField={fieldId => dispatchOp({ type: 'DELETE_BASE_FIELD', deviceId: device.id, fieldId })}
        onAddRow={row => dispatchOp({ type: 'ADD_BASE_ROW', deviceId: device.id, row })}
        onSetCell={(rowId, fieldId, value) => dispatchOp({ type: 'SET_BASE_CELL', deviceId: device.id, rowId, fieldId, value })}
        onDeleteRow={rowId => dispatchOp({ type: 'DELETE_BASE_ROW', deviceId: device.id, rowId })}
      />
    );
  }
  if (device.type === 'FORM') {
    const base = device.baseDeviceId ? devices[device.baseDeviceId] : null;
    return (
      <TelaForm
        key={device.id}
        device={device}
        base={base?.type === 'BASE' ? base : null}
        bases={bases}
        readOnly={readOnly}
        onSetBase={baseDeviceId => dispatchOp({ type: 'SET_FORM_BASE', deviceId: device.id, baseDeviceId })}
        onSubmit={(values, grading, audit) => { if (device.baseDeviceId) dispatchOp({ type: 'ADD_BASE_ROW', deviceId: device.baseDeviceId, row: { id: uid('row'), values, grading, submissionAudit: audit ? { ...audit, studentId: auth.currentUser?.uid || audit.studentId, studentName: auth.currentUser?.displayName || audit.studentName } : undefined } }); }}
      />
    );
  }
  if (device.type === 'VECTOR') {
    return (
      <TelaVector
        key={device.id}
        device={device}
        readOnly={readOnly}
        chrome={!readOnly}
        writerTexts={writerTexts}
        writers={writers}
        onAddObject={object => dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: device.id, object })}
        onUpdateObject={(objectId, patch) => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: device.id, objectId, patch })}
        onDeleteObject={objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: device.id, objectId })}
        onReorder={(objectId, toIndex) => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: device.id, objectId, toIndex })}
      />
    );
  }
  if (device.type === 'IMAGE') {
    return (
      <TelaImage
        key={device.id}
        device={device}
        readOnly={readOnly}
        chrome={!readOnly}
        onAddLayer={layer => dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId: device.id, layer })}
        onUpdateLayer={(layerId, patch) => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: device.id, layerId, patch })}
        onDeleteLayer={layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: device.id, layerId })}
        onReorder={(layerId, toIndex) => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: device.id, layerId, toIndex })}
      />
    );
  }
  if (device.type === 'NOTES') {
    return <TelaNotes key={device.id} device={device} readOnly={readOnly} onChange={patch => dispatchOp({ type: 'UPDATE_NOTES_DEVICE', deviceId: device.id, patch })}/>;
  }
  return (
    <TelaGrid
      key={device.id}
      device={device}
      readOnly={readOnly}
      formulaContext={formulaContext}
      onSetCell={(key, value) => dispatchOp({ type: 'SET_GRID_CELL', deviceId: device.id, key, value })}
    />
  );
}

/**
 * Build the render context from a raw doc-shape (devices + frames). Both the
 * canvas and the embed compute the same live maps this way, so bound TEXT,
 * cross-device formulas and Form targets resolve identically everywhere.
 */
export function buildRenderMaps(
  devices: Record<string, TelaDevice>,
  frames: { label?: string; deviceIds: string[] }[],
  blockPlainText: (b: { text: string }) => string,
): {
  writerTexts: Record<string, string>;
  writers: { id: string; name: string }[];
  bases: { id: string; name: string }[];
  formulaContext: TelaFormulaContext;
} {
  const writerTexts: Record<string, string> = {};
  for (const id in devices) {
    const d = devices[id];
    if (d.type === 'WRITER') writerTexts[id] = d.blocks.map(blockPlainText).filter(Boolean).join('\n');
  }
  const writers: { id: string; name: string }[] = [];
  const bases: { id: string; name: string }[] = [];
  const grids = new Map<string, Record<string, string>>();
  const baseLites = new Map<string, TelaBaseLite>();
  for (const f of frames) for (const id of f.deviceIds) {
    const dev = devices[id];
    if (!dev) continue;
    const label = (f.label || '').toLowerCase().trim();
    if (dev.type === 'WRITER') writers.push({ id: dev.id, name: f.label || 'Writer' });
    if (dev.type === 'GRID') { if (label) grids.set(label, dev.cells); grids.set(id.toLowerCase(), dev.cells); }
    if (dev.type === 'BASE') {
      bases.push({ id: dev.id, name: dev.name || f.label || 'Base' });
      const lite: TelaBaseLite = { fields: dev.fields, rows: dev.rows };
      if (dev.name) baseLites.set(dev.name.toLowerCase().trim(), lite);
      if (label) baseLites.set(label, lite);
      baseLites.set(id.toLowerCase(), lite);
    }
  }
  const formulaContext: TelaFormulaContext = {
    resolveGrid: n => grids.get(n.toLowerCase()) ?? null,
    resolveBase: n => baseLites.get(n.toLowerCase()) ?? null,
  };
  return { writerTexts, writers, bases, formulaContext };
}
