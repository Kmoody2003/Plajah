// Molecular structures: our own PDB and mmCIF readers, bond finding, secondary structure,
// sequences and simple facts. Runs in the browser, the desktop app and node.
//
// Sources the room fetches (licences shown to the user, see sources.ts):
//   RCSB PDB  files.rcsb.org     (PDB archive data: CC0)
//   AlphaFold alphafold.ebi.ac.uk (CC-BY 4.0, credit required)

export interface Atom {
  serial: number;
  name: string;      // CA, N, O, ...
  element: string;   // C, N, O, FE, ...
  resName: string;   // ALA, HOH, HEM, ...
  chain: string;
  resSeq: number;
  insCode: string;
  x: number; y: number; z: number;
  b: number;         // B-factor; pLDDT (0-100) for AlphaFold models
  occupancy: number;
  het: boolean;
  altLoc: string;
}

export type SecondaryKind = 'helix' | 'sheet';
export interface SecondaryRange { kind: SecondaryKind; chain: string; start: number; end: number; /** Worked out from CA geometry (the file listed none). */ computed?: boolean }

export interface Structure {
  id: string;
  title: string;
  method: string;
  resolution?: number;
  atoms: Atom[];
  /** Pairs of atom indices. */
  bonds: Uint32Array;
  secondary: SecondaryRange[];
  chains: ChainInfo[];
  /** True when B-factors are AlphaFold confidence (pLDDT). */
  predicted: boolean;
  warnings: string[];
}

export interface ChainInfo { id: string; sequence: string; residues: number; ligands: string[]; waters: number; kind: 'protein' | 'nucleic' | 'other' }

// ── Residue tables ──────────────────────────────────────────────────────────

export const AMINO: Record<string, string> = { ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', SEC: 'U', PYL: 'O', MSE: 'M' };
export const NUCLEIC: Record<string, string> = { A: 'A', C: 'C', G: 'G', U: 'U', T: 'T', DA: 'A', DC: 'C', DG: 'G', DT: 'T', DU: 'U', I: 'I', DI: 'I' };
const WATER = new Set(['HOH', 'WAT', 'H2O', 'DOD', 'TIP', 'TIP3', 'SOL']);

/** Average residue masses (Da) inside a chain; a water is added once per chain. */
const RES_MASS: Record<string, number> = { A: 71.08, R: 156.19, N: 114.10, D: 115.09, C: 103.14, Q: 128.13, E: 129.12, G: 57.05, H: 137.14, I: 113.16, L: 113.16, K: 128.17, M: 131.19, F: 147.18, P: 97.12, S: 87.08, T: 101.10, W: 186.21, Y: 163.18, V: 99.13, U: 150.04, O: 237.30 };

/** Covalent radii (Å), Cordero et al. 2008; the default covers the rest. */
const COVALENT: Record<string, number> = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07, F: 0.57, CL: 1.02, BR: 1.20, I: 1.39, SE: 1.20, FE: 1.32, ZN: 1.22, MG: 1.41, CA: 1.76, NA: 1.66, K: 2.03, MN: 1.39, CU: 1.32, CO: 1.26, NI: 1.24, B: 0.84, SI: 1.11 };

/** CPK-style element colours (Jmol palette). */
export const ELEMENT_COLOR: Record<string, string> = { H: '#ffffff', C: '#909090', N: '#3050f8', O: '#ff0d0d', S: '#ffff30', P: '#ff8000', F: '#90e050', CL: '#1ff01f', BR: '#a62929', I: '#940094', FE: '#e06633', ZN: '#7d80b0', MG: '#8aff00', CA: '#3dff00', NA: '#ab5cf2', K: '#8f40d4', MN: '#9c7ac7', CU: '#c88033', CO: '#f090a0', NI: '#50d050', SE: '#ffa100' };
export const VDW: Record<string, number> = { H: 1.2, C: 1.7, N: 1.55, O: 1.52, S: 1.8, P: 1.8, F: 1.47, CL: 1.75, BR: 1.85, I: 1.98, FE: 1.94, ZN: 1.39, MG: 1.73, CA: 2.31, NA: 2.27, K: 2.75 };

// ── PDB ─────────────────────────────────────────────────────────────────────

const col = (line: string, a: number, b: number) => line.slice(a - 1, b).trim();

function guessElement(name: string, resName: string): string {
  const n = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (AMINO[resName] || NUCLEIC[resName]) return n[0] ?? 'C'; // in residues, atom names start with the element letter
  const two = n.slice(0, 2); if (COVALENT[two] && two.length === 2 && two !== 'CA' && two !== 'NE' && two !== 'CD') return two;
  return n[0] ?? 'C';
}

export function parsePdb(text: string, id = ''): Structure {
  const atoms: Atom[] = []; const secondary: SecondaryRange[] = []; const warnings: string[] = [];
  let title = '', method = '', resolution: number | undefined; let model = 0; let sawModel = false;
  const conect: Array<[number, number]> = [];
  for (const line of text.split(/\r?\n/)) {
    const rec = line.slice(0, 6).trim();
    if (rec === 'HEADER' && !id) id = col(line, 63, 66);
    else if (rec === 'TITLE') title += (title ? ' ' : '') + col(line, 11, 80);
    else if (rec === 'EXPDTA') method = col(line, 11, 79);
    else if (rec === 'REMARK' && line.startsWith('REMARK   2 RESOLUTION.')) { const r = parseFloat(line.slice(23, 30)); if (Number.isFinite(r)) resolution = r; }
    else if (rec === 'MODEL') { model++; sawModel = true; }
    else if ((rec === 'ATOM' || rec === 'HETATM') && (!sawModel || model === 1)) {
      const altLoc = line[16]?.trim() ?? '';
      if (altLoc && altLoc !== 'A') continue; // first alternate location only
      const resName = col(line, 18, 20); const name = col(line, 13, 16);
      atoms.push({ serial: parseInt(col(line, 7, 11), 10), name, element: (col(line, 77, 78) || guessElement(name, resName)).toUpperCase(), resName, chain: line[21]?.trim() || 'A', resSeq: parseInt(col(line, 23, 26), 10), insCode: line[26]?.trim() ?? '', x: parseFloat(col(line, 31, 38)), y: parseFloat(col(line, 39, 46)), z: parseFloat(col(line, 47, 54)), occupancy: parseFloat(col(line, 55, 60)) || 1, b: parseFloat(col(line, 61, 66)) || 0, het: rec === 'HETATM', altLoc });
    }
    else if (rec === 'HELIX') secondary.push({ kind: 'helix', chain: line[19]?.trim() || 'A', start: parseInt(col(line, 22, 25), 10), end: parseInt(col(line, 34, 37), 10) });
    else if (rec === 'SHEET') secondary.push({ kind: 'sheet', chain: line[21]?.trim() || 'A', start: parseInt(col(line, 23, 26), 10), end: parseInt(col(line, 34, 37), 10) });
    else if (rec === 'CONECT') {
      const a = parseInt(col(line, 7, 11), 10);
      for (const [s, e] of [[12, 16], [17, 21], [22, 26], [27, 31]]) { const b = parseInt(col(line, s, e), 10); if (Number.isFinite(b) && a < b) conect.push([a, b]); }
    }
  }
  if (model > 1) warnings.push(`${model} models in the file; showing the first.`);
  return finishStructure({ id: id || 'structure', title: title || id, method, resolution, atoms, secondary, warnings }, conect);
}

// ── mmCIF (the PDB's main format since 2014; large structures only come this way) ──

/** Tokenise CIF: quoted strings, ;text fields;, and bare words. */
function cifTokens(text: string): string[] {
  const out: string[] = []; const n = text.length; let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '#') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (c === ';' && (i === 0 || text[i - 1] === '\n')) { const e = text.indexOf('\n;', i + 1); out.push(text.slice(i + 1, e < 0 ? n : e).trim()); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < n && !(text[j] === c && (j + 1 >= n || /\s/.test(text[j + 1])))) j++; out.push(text.slice(i + 1, j)); i = j + 1; continue; }
    let j = i; while (j < n && !/\s/.test(text[j])) j++; out.push(text.slice(i, j)); i = j;
  }
  return out;
}

/** Categories as name -> rows of field -> value (single items become one row). */
export function parseCifCategories(text: string, wanted: Set<string>): Record<string, Array<Record<string, string>>> {
  const t = cifTokens(text); const out: Record<string, Array<Record<string, string>>> = {}; let i = 0;
  while (i < t.length) {
    const tok = t[i];
    if (tok === 'loop_') {
      const fields: string[] = []; i++;
      while (i < t.length && t[i].startsWith('_')) fields.push(t[i++]);
      const cat = fields[0]?.split('.')[0] ?? ''; const keep = wanted.has(cat); const rows: Array<Record<string, string>> = [];
      while (i < t.length && !t[i].startsWith('_') && t[i] !== 'loop_' && !t[i].startsWith('data_')) {
        if (keep) { const row: Record<string, string> = {}; for (const f of fields) row[f.split('.')[1]] = t[i++] ?? ''; rows.push(row); }
        else i += fields.length;
      }
      if (keep) out[cat] = (out[cat] ?? []).concat(rows);
      continue;
    }
    if (tok.startsWith('_') && tok.includes('.')) {
      const [cat, field] = tok.split('.'); const v = t[i + 1] ?? '';
      if (wanted.has(cat)) { out[cat] ??= [{}]; out[cat][0][field] = v; }
      i += 2; continue;
    }
    i++;
  }
  return out;
}

export function parseMmcif(text: string, id = ''): Structure {
  const cats = parseCifCategories(text, new Set(['_atom_site', '_struct', '_exptl', '_refine', '_reflns', '_struct_conf', '_struct_sheet_range', '_entry', '_ma_qa_metric_global']));
  const warnings: string[] = [];
  const site = cats._atom_site ?? [];
  const firstModel = site[0]?.pdbx_PDB_model_num;
  const models = new Set(site.map(r => r.pdbx_PDB_model_num));
  if (models.size > 1) warnings.push(`${models.size} models in the file; showing the first.`);
  const num = (v?: string) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : 0; };
  const clean = (v?: string) => (v === '?' || v === '.' || v === undefined ? '' : v);
  const atoms: Atom[] = [];
  for (const r of site) {
    if (firstModel && r.pdbx_PDB_model_num !== firstModel) continue;
    const alt = clean(r.label_alt_id); if (alt && alt !== 'A') continue;
    atoms.push({ serial: num(r.id), name: clean(r.auth_atom_id) || clean(r.label_atom_id), element: (clean(r.type_symbol) || 'C').toUpperCase(), resName: clean(r.auth_comp_id) || clean(r.label_comp_id), chain: clean(r.auth_asym_id) || clean(r.label_asym_id) || 'A', resSeq: num(r.auth_seq_id || r.label_seq_id), insCode: clean(r.pdbx_PDB_ins_code), x: num(r.Cartn_x), y: num(r.Cartn_y), z: num(r.Cartn_z), occupancy: num(r.occupancy) || 1, b: num(r.B_iso_or_equiv), het: r.group_PDB === 'HETATM', altLoc: alt });
  }
  const secondary: SecondaryRange[] = [];
  for (const r of cats._struct_conf ?? []) if (/^HELX/i.test(r.conf_type_id ?? '')) secondary.push({ kind: 'helix', chain: clean(r.beg_auth_asym_id) || clean(r.beg_label_asym_id), start: num(r.beg_auth_seq_id || r.beg_label_seq_id), end: num(r.end_auth_seq_id || r.end_label_seq_id) });
  for (const r of cats._struct_sheet_range ?? []) secondary.push({ kind: 'sheet', chain: clean(r.beg_auth_asym_id) || clean(r.beg_label_asym_id), start: num(r.beg_auth_seq_id || r.beg_label_seq_id), end: num(r.end_auth_seq_id || r.end_label_seq_id) });
  const res = clean(cats._refine?.[0]?.ls_d_res_high) || clean(cats._reflns?.[0]?.d_resolution_high);
  return finishStructure({ id: id || clean(cats._entry?.[0]?.id) || 'structure', title: clean(cats._struct?.[0]?.title), method: clean(cats._exptl?.[0]?.method), resolution: res ? parseFloat(res) : undefined, atoms, secondary, warnings, predictedHint: !!cats._ma_qa_metric_global }, []);
}

export function parseStructure(text: string, name = ''): Structure {
  const id = name.replace(/\.[^.]+$/, '').toUpperCase();
  return /^\s*data_/m.test(text.slice(0, 2000)) && text.includes('_atom_site.') ? parseMmcif(text, id) : parsePdb(text, id);
}

// ── Shared finish: bonds, chains, AlphaFold detection ───────────────────────

function finishStructure(s: { id: string; title: string; method: string; resolution?: number; atoms: Atom[]; secondary: SecondaryRange[]; warnings: string[]; predictedHint?: boolean }, conect: Array<[number, number]>): Structure {
  const atoms = s.atoms;
  const bonds = findBonds(atoms, conect);
  const chains = chainInfo(atoms);
  if (!s.secondary.length && atoms.length) { s.secondary = assignSecondary(atoms); if (s.secondary.length) s.secondary.forEach(r => r.computed = true); }
  const predicted = !!s.predictedHint || /alphafold|predicted|theoretical model/i.test(`${s.title} ${s.method}`) || (atoms.length > 0 && !atoms.some(a => a.het) && atoms.every(a => a.b >= 0 && a.b <= 100) && /^AF-/i.test(s.id));
  if (!atoms.length) s.warnings.push('No atoms found. Is this a PDB or mmCIF file?');
  return { id: s.id, title: s.title, method: s.method || (predicted ? 'PREDICTED (AlphaFold)' : ''), resolution: s.resolution, atoms, bonds, secondary: s.secondary, chains, predicted, warnings: s.warnings };
}

/** Distance bonds inside each residue and to the next residue, on a spatial hash; plus CONECT. */
export function findBonds(atoms: Atom[], conect: Array<[number, number]> = []): Uint32Array {
  const out: number[] = []; const cell = 2.0; const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  atoms.forEach((a, i) => { if (WATER.has(a.resName)) return; const k = key(a.x, a.y, a.z); const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); });
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]; if (WATER.has(a.resName)) continue;
    const ra = COVALENT[a.element] ?? 0.9; const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell), cz = Math.floor(a.z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!l) continue;
      for (const j of l) {
        if (j <= i) continue; const b = atoms[j];
        // Only bond within a chain; across residues only backbone-to-backbone or het groups.
        if (a.chain !== b.chain && !(a.het && b.het)) continue;
        const max = ra + (COVALENT[b.element] ?? 0.9) + 0.45; const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
        if (d2 < 0.16 || d2 > max * max) continue;
        if ((a.resSeq !== b.resSeq || a.resName !== b.resName) && !(a.het || b.het) && !isLink(a, b)) continue;
        out.push(i, j);
      }
    }
  }
  if (conect.length) {
    const bySerial = new Map(atoms.map((a, i) => [a.serial, i])); const seen = new Set<string>();
    for (let k = 0; k < out.length; k += 2) seen.add(`${out[k]}_${out[k + 1]}`);
    for (const [sa, sb] of conect) { const i = bySerial.get(sa), j = bySerial.get(sb); if (i === undefined || j === undefined) continue; const [p, q] = i < j ? [i, j] : [j, i]; if (!seen.has(`${p}_${q}`)) { seen.add(`${p}_${q}`); out.push(p, q); } }
  }
  return new Uint32Array(out);
}

/** Peptide (C-N), nucleic backbone (O3'-P) and disulfide (SG-SG) links between residues. */
function isLink(a: Atom, b: Atom) {
  const pair = (x: string, y: string) => (a.name === x && b.name === y) || (a.name === y && b.name === x);
  return pair('C', 'N') || pair("O3'", 'P') || pair('O3*', 'P') || pair('SG', 'SG');
}

function chainInfo(atoms: Atom[]): ChainInfo[] {
  const map = new Map<string, ChainInfo & { seen: Set<string>; ligSet: Set<string> }>();
  for (const a of atoms) {
    let c = map.get(a.chain);
    if (!c) { c = { id: a.chain, sequence: '', residues: 0, ligands: [], waters: 0, kind: 'other', seen: new Set(), ligSet: new Set() }; map.set(a.chain, c); }
    const rk = `${a.resSeq}${a.insCode}${a.resName}`; if (c.seen.has(rk)) continue; c.seen.add(rk);
    if (WATER.has(a.resName)) { c.waters++; continue; }
    const aa = AMINO[a.resName], nu = NUCLEIC[a.resName];
    if (aa && !a.het || (aa && a.resName === 'MSE')) { c.sequence += aa; c.residues++; }
    else if (nu && !a.het) { c.sequence += nu; c.residues++; }
    else c.ligSet.add(a.resName);
  }
  return [...map.values()].map(({ seen: _s, ligSet, ...c }) => {
    const protein = [...c.sequence].filter(ch => RES_MASS[ch]).length; const kind: ChainInfo['kind'] = c.residues === 0 ? 'other' : protein >= c.residues * 0.6 ? 'protein' : 'nucleic';
    return { ...c, ligands: [...ligSet], kind };
  });
}

/** Approximate protein mass in daltons from the sequence. */
export function proteinMass(seq: string): number {
  let m = 18.02; for (const ch of seq) m += RES_MASS[ch] ?? 110; return m;
}

/** AlphaFold confidence bands (pLDDT): the colours the AlphaFold database uses. */
export function plddtColor(b: number): string {
  return b >= 90 ? '#0053d6' : b >= 70 ? '#65cbf3' : b >= 50 ? '#ffdb13' : '#ff7d45';
}

export function secondaryAt(s: Structure, chain: string, resSeq: number): SecondaryKind | null {
  for (const r of s.secondary) if (r.chain === chain && resSeq >= r.start && resSeq <= r.end) return r.kind;
  return null;
}

export function structureBounds(atoms: Atom[]) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const a of atoms) { const p = [a.x, a.y, a.z]; for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; } }
  return { min, max, center: min.map((v, k) => (v + max[k]) / 2), radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 };
}

/**
 * Secondary structure from C-alpha geometry alone, for files that list none (AlphaFold models,
 * many PDB-format exports). Helix: CA(i)-CA(i+3) about 5.0-5.4 Å and CA(i)-CA(i+4) about 6.2 Å.
 * Strand: extended, CA(i)-CA(i+2) about 6.4-7.2 Å. A simplified P-SEA-style rule: good for a
 * cartoon, not a replacement for DSSP.
 */
export function assignSecondary(atoms: Atom[]): SecondaryRange[] {
  const out: SecondaryRange[] = []; const byChain = new Map<string, Atom[]>();
  for (const a of atoms) if (!a.het && a.name === 'CA' && AMINO[a.resName]) { const l = byChain.get(a.chain) ?? []; l.push(a); byChain.set(a.chain, l); }
  const d = (a: Atom, b: Atom) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  for (const [chain, ca] of byChain) {
    const n = ca.length; const kind: Array<SecondaryKind | null> = new Array(n).fill(null);
    for (let i = 0; i + 4 < n; i++) if (d(ca[i], ca[i + 3]) > 4.5 && d(ca[i], ca[i + 3]) < 5.6 && d(ca[i], ca[i + 4]) > 5.5 && d(ca[i], ca[i + 4]) < 6.9) for (let k = i; k <= i + 4; k++) kind[k] = 'helix';
    for (let i = 0; i + 2 < n; i++) if (!kind[i] && !kind[i + 1] && !kind[i + 2] && d(ca[i], ca[i + 2]) > 6.3 && d(ca[i], ca[i + 2]) < 7.3) { kind[i] ??= 'sheet'; kind[i + 1] ??= 'sheet'; kind[i + 2] ??= 'sheet'; }
    // Runs: helices of 4+, strands of 3+.
    let i = 0;
    while (i < n) {
      const k = kind[i]; let j = i; while (j + 1 < n && kind[j + 1] === k && ca[j + 1].resSeq === ca[j].resSeq + 1) j++;
      if (k && j - i + 1 >= (k === 'helix' ? 4 : 3)) out.push({ kind: k, chain, start: ca[i].resSeq, end: ca[j].resSeq });
      i = j + 1;
    }
  }
  return out;
}
