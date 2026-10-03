/**
 * Investigations: a student's guided science / engineering / statistics project. Saved on the device
 * and, when signed in, ALSO written into the Plajah Labs Notebook as an EXPERIMENT entry, so the
 * work lives in the same notebook as the rest of a student's Labs research (search, pin, share, cite).
 */
import { putEntry } from './notebookService';
import type { ThinkingMethod } from '../data/thinkingMethods';

export interface GraphSettings {
  type: 'SCATTER' | 'LINE' | 'BAR';
  xCol: number; yCol: number;
  xT: 'none' | 'square' | 'sqrt' | 'ln' | 'inverse'; yT: 'none' | 'square' | 'sqrt' | 'ln' | 'inverse';
  fit: boolean; title: string;
}
export interface DataTable { headers: string[]; rows: string[][]; /** where the data came from, for citation */ source?: string }
export interface Investigation {
  id: string; methodId: string; title: string; stepIndex: number;
  fields: Record<string, string>;
  vars: { independent: string; dependent: string; controlled: string };
  cer: { claim: string; evidence: string; reasoning: string };
  table: DataTable; graph: GraphSettings;
  experimentId?: string;
  updatedAt: number;
}

export const emptyInvestigation = (methodId: string): Investigation => ({
  id: `inv_${Math.random().toString(36).slice(2, 10)}`, methodId, title: '', stepIndex: 0, fields: {},
  vars: { independent: '', dependent: '', controlled: '' }, cer: { claim: '', evidence: '', reasoning: '' },
  table: { headers: ['x', 'y'], rows: [['', '']] },
  graph: { type: 'SCATTER', xCol: 0, yCol: 1, xT: 'none', yT: 'none', fit: true, title: '' },
  updatedAt: Date.now(),
});

const lsKey = (uid: string) => `plajah:investigations:${uid}`;
export function listInvestigations(uid = 'anon'): Investigation[] {
  try { return (JSON.parse(localStorage.getItem(lsKey(uid)) || '[]') as Investigation[]).sort((a, b) => b.updatedAt - a.updatedAt); } catch { return []; }
}
export function saveLocal(inv: Investigation, uid = 'anon'): void {
  const next = [{ ...inv, updatedAt: Date.now() }, ...listInvestigations(uid).filter(i => i.id !== inv.id)].slice(0, 40);
  try { localStorage.setItem(lsKey(uid), JSON.stringify(next)); } catch { /* quota / private mode */ }
}
export function deleteLocal(id: string, uid = 'anon'): void {
  try { localStorage.setItem(lsKey(uid), JSON.stringify(listInvestigations(uid).filter(i => i.id !== id))); } catch { /* */ }
}

/** The Labs Notebook entry for an investigation (type EXPERIMENT, fields the Notebook already renders). */
export function toNotebookEntry(inv: Investigation, method: ThinkingMethod) {
  const dataSummary = inv.table.rows.filter(r => r.some(c => c.trim())).length;
  const f = inv.fields;
  const content = [
    `Method: ${method.title}`,
    f.question && `Question: ${f.question}`,
    f.problem && `Problem: ${f.problem}`,
    inv.vars.independent && `Change (independent): ${inv.vars.independent}`,
    inv.vars.dependent && `Measure (dependent): ${inv.vars.dependent}`,
    inv.vars.controlled && `Keep the same: ${inv.vars.controlled}`,
    dataSummary ? `Data: ${dataSummary} rows (${inv.table.headers.join(', ')})${inv.table.source ? `. Source: ${inv.table.source}` : ''}` : '',
    f.error && `Sources of error: ${f.error}`, f.next && `Next question: ${f.next}`,
  ].filter(Boolean).join('\n');
  const conf: 'LOW' | 'MEDIUM' | 'HIGH' = dataSummary >= 8 ? 'MEDIUM' : 'LOW';
  return {
    id: `nb_${inv.id}`, type: 'EXPERIMENT' as const, title: inv.title || f.question || f.problem || 'Investigation',
    content, tags: ['investigation', method.id], discipline: undefined, createdAt: inv.updatedAt, updatedAt: Date.now(),
    experiment: {
      hypothesis: f.hypothesis || f.question || f.problem || '', method: f.plan || f.prototype || f.analysis || '',
      results: [inv.cer.evidence, f.results].filter(Boolean).join('\n'), conclusion: [inv.cer.claim, inv.cer.reasoning].filter(Boolean).join('\n'), confidence: conf,
    },
  };
}

/** Save everywhere: this device always; the Labs Notebook when a uid is known. Returns whether the notebook write was attempted. */
export async function saveInvestigation(inv: Investigation, method: ThinkingMethod, uid?: string): Promise<boolean> {
  saveLocal(inv, uid || 'anon');
  if (!uid) return false;
  try { await putEntry(`labsNotebook_${uid}`, toNotebookEntry(inv, method)); return true; } catch { return false; }
}
