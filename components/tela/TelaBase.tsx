/**
 * TelaBase — the database device (P1). The system of record other devices
 * bind to. P1 view is a table: typed fields (TEXT / NUMBER / SELECT / CHECKBOX /
 * DATE), rows you add/edit/delete, checkbox + select editors, tabular numbers.
 * Kanban / gallery / calendar views arrive later.
 *
 * Every mutation is ops-shaped through the parent (add/rename/delete field,
 * add/set/delete row) so ids stay stable and multiplayer later is an op-log
 * change. Rows produced by a binding (derivedFromBindingId) render read-only —
 * they are re-synced from their source and must never be hand-edited away.
 */
import React, { useState } from 'react';
import { Check, Plus, Trash2, Link2 } from 'lucide-react';
import type { TelaBaseDevice, TelaField, TelaFieldType, TelaRow } from '../../types';

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const TYPE_LABEL: Record<TelaFieldType, string> = {
  TEXT: 'Text', NUMBER: 'Number', SELECT: 'Select', CHECKBOX: 'Check', DATE: 'Date',
};
const TYPES: TelaFieldType[] = ['TEXT', 'NUMBER', 'SELECT', 'CHECKBOX', 'DATE'];

const COL_W = 150;
const HEAD_BG = '#F0EDF4';
const HAIR = '#E6E2EC';
const INK = '#1B1523';

interface TelaBaseProps {
  device: TelaBaseDevice;
  readOnly?: boolean;
  onAddField: (field: TelaField) => void;
  onUpdateField: (fieldId: string, patch: Partial<TelaField>) => void;
  onDeleteField: (fieldId: string) => void;
  onAddRow: (row: TelaRow) => void;
  onSetCell: (rowId: string, fieldId: string, value: string) => void;
  onDeleteRow: (rowId: string) => void;
}

const TelaBase: React.FC<TelaBaseProps> = ({
  device, readOnly, onAddField, onUpdateField, onDeleteField, onAddRow, onSetCell, onDeleteRow,
}) => {
  const [addingOpt, setAddingOpt] = useState<{ rowId: string; fieldId: string } | null>(null);
  const [optDraft, setOptDraft] = useState('');

  const fields = device.fields;

  const addField = () => {
    const n = fields.length + 1;
    onAddField({ id: uid('fld'), name: `Field ${n}`, type: 'TEXT' });
  };
  const addRow = () => onAddRow({ id: uid('row'), values: {} });

  const commitNewOption = (field: TelaField, rowId: string) => {
    const opt = optDraft.trim();
    if (opt) {
      if (!(field.options || []).includes(opt)) {
        onUpdateField(field.id, { options: [...(field.options || []), opt] });
      }
      onSetCell(rowId, field.id, opt);
    }
    setAddingOpt(null);
    setOptDraft('');
  };

  const cellInputStyle: React.CSSProperties = {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    font: 'inherit', color: INK, padding: '0 8px', height: 28,
  };

  const renderCell = (field: TelaField, row: TelaRow, locked: boolean) => {
    const v = row.values[field.id] ?? '';
    if (field.type === 'CHECKBOX') {
      const on = v === '1';
      return (
        <button
          disabled={locked}
          onClick={() => onSetCell(row.id, field.id, on ? '' : '1')}
          style={{
            display: 'grid', placeItems: 'center', width: 18, height: 18, margin: '5px auto',
            borderRadius: 5, border: `1.5px solid ${on ? 'var(--pj-purple,#6B0099)' : '#C9C2D6'}`,
            background: on ? 'var(--pj-purple,#6B0099)' : '#fff', cursor: locked ? 'default' : 'pointer',
          }}
        >
          {on && <Check size={12} color="#fff" strokeWidth={3} />}
        </button>
      );
    }
    if (field.type === 'SELECT') {
      const isAdding = addingOpt && addingOpt.rowId === row.id && addingOpt.fieldId === field.id;
      if (isAdding) {
        return (
          <input
            autoFocus
            value={optDraft}
            onChange={e => setOptDraft(e.target.value)}
            onBlur={() => commitNewOption(field, row.id)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitNewOption(field, row.id); } else if (e.key === 'Escape') { setAddingOpt(null); setOptDraft(''); } }}
            placeholder="New option…"
            style={cellInputStyle}
          />
        );
      }
      return (
        <select
          disabled={locked}
          value={v}
          onChange={e => { if (e.target.value === '__new__') { setAddingOpt({ rowId: row.id, fieldId: field.id }); setOptDraft(''); } else onSetCell(row.id, field.id, e.target.value); }}
          style={{ ...cellInputStyle, cursor: locked ? 'default' : 'pointer', appearance: 'none' }}
        >
          <option value="">—</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          {!locked && <option value="__new__">＋ New…</option>}
        </select>
      );
    }
    const type = field.type === 'NUMBER' ? 'text' : field.type === 'DATE' ? 'date' : 'text';
    return (
      <input
        readOnly={locked}
        type={type}
        inputMode={field.type === 'NUMBER' ? 'decimal' : undefined}
        value={v}
        onChange={e => onSetCell(row.id, field.id, e.target.value)}
        style={{
          ...cellInputStyle,
          textAlign: field.type === 'NUMBER' ? 'right' : 'left',
          fontVariantNumeric: field.type === 'NUMBER' ? 'tabular-nums' : undefined,
        }}
      />
    );
  };

  return (
    <div
      className="tela-base custom-scrollbar"
      style={{ height: '100%', overflow: 'auto', background: '#fff', color: INK, fontFamily: 'var(--font-sans, system-ui, sans-serif)', fontSize: 12.5 }}
    >
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: 26, minWidth: 26, background: HEAD_BG, border: `1px solid ${HAIR}`, position: 'sticky', top: 0, zIndex: 2 }} />
            {fields.map(field => (
              <th
                key={field.id}
                style={{ width: COL_W, minWidth: COL_W, background: HEAD_BG, border: `1px solid ${HAIR}`, padding: '4px 6px', textAlign: 'left', verticalAlign: 'top', position: 'sticky', top: 0, zIndex: 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    readOnly={readOnly}
                    value={field.name}
                    onChange={e => onUpdateField(field.id, { name: e.target.value })}
                    style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontWeight: 700, color: INK }}
                  />
                  {!readOnly && (
                    <button title="Remove field" onClick={() => onDeleteField(field.id)} style={{ display: 'grid', placeItems: 'center', width: 16, height: 16, border: 'none', background: 'transparent', color: '#A398B4', cursor: 'pointer' }}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
                {readOnly ? (
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9A8FAC' }}>{TYPE_LABEL[field.type]}</span>
                ) : (
                  <select
                    value={field.type}
                    onChange={e => onUpdateField(field.id, { type: e.target.value as TelaFieldType })}
                    style={{ marginTop: 2, border: 'none', background: 'transparent', font: 'inherit', fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A8FAC', cursor: 'pointer', appearance: 'none', outline: 'none' }}
                  >
                    {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                )}
              </th>
            ))}
            {!readOnly && (
              <th style={{ width: 34, minWidth: 34, background: HEAD_BG, border: `1px solid ${HAIR}`, position: 'sticky', top: 0, zIndex: 1 }}>
                <button title="Add field" onClick={addField} style={{ display: 'grid', placeItems: 'center', width: '100%', height: 26, border: 'none', background: 'transparent', color: '#6E6480', cursor: 'pointer' }}>
                  <Plus size={14} />
                </button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {device.rows.map(row => {
            const derived = !!row.derivedFromBindingId;
            const locked = readOnly || derived;
            return (
              <tr key={row.id}>
                <td style={{ width: 26, minWidth: 26, background: derived ? 'rgba(0,218,243,0.08)' : HEAD_BG, borderLeft: derived ? '2px solid var(--pj-cyan,#00DAF3)' : `1px solid ${HAIR}`, borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}`, textAlign: 'center', color: '#B7ADC6' }}>
                  {derived && <Link2 size={11} color="var(--pj-cyan,#00DAF3)" />}
                </td>
                {fields.map(field => (
                  <td key={field.id} style={{ width: COL_W, minWidth: COL_W, border: `1px solid ${HAIR}`, background: derived ? 'rgba(0,218,243,0.035)' : '#fff', padding: 0, height: 28 }}>
                    {renderCell(field, row, locked)}
                  </td>
                ))}
                {!readOnly && (
                  <td style={{ width: 34, minWidth: 34, border: `1px solid ${HAIR}`, background: '#fff', textAlign: 'center' }}>
                    {!derived && (
                      <button title="Delete row" onClick={() => onDeleteRow(row.id)} style={{ display: 'grid', placeItems: 'center', width: '100%', height: 28, border: 'none', background: 'transparent', color: '#C6BDD4', cursor: 'pointer' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {!readOnly && (
        <button
          onClick={addRow}
          style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 8, padding: '6px 12px', border: `1px dashed ${HAIR}`, borderRadius: 8, background: '#FBFAFD', color: '#6E6480', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={13} /> New row
        </button>
      )}
      {!device.rows.length && (
        <div style={{ padding: '4px 14px 14px', fontSize: 11.5, color: '#A398B4' }}>
          Empty base — add rows here, or point a Form at it, or send a Writer’s items in.
        </div>
      )}
    </div>
  );
};

export default TelaBase;
