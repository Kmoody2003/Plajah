// Public structure sources. Each result carries the credit its licence asks for; the room and
// the Tela item show it.
//   RCSB PDB      experimental structures, data CC0 (credit appreciated)
//   AlphaFold DB  predicted structures, CC-BY 4.0 (credit required)

export interface SourceFile { name: string; text: string; credit: string; licence: string; url: string }

export const PDB_ID = /^[0-9][A-Za-z0-9]{3}$/;
export const UNIPROT = /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/;

export async function fetchPdbEntry(id: string, f: typeof fetch = fetch): Promise<SourceFile> {
  const clean = id.trim().toUpperCase();
  if (!PDB_ID.test(clean)) throw new Error('A PDB ID is 4 characters, like 1CRN or 4HHB.');
  const url = `https://files.rcsb.org/download/${clean}.cif`;
  const r = await f(url); if (!r.ok) throw new Error(r.status === 404 ? `No PDB entry ${clean}.` : `RCSB returned ${r.status}.`);
  return { name: `${clean}.cif`, text: await r.text(), credit: `RCSB PDB ${clean}`, licence: 'CC0 1.0', url: `https://www.rcsb.org/structure/${clean}` };
}

export async function fetchAlphaFold(accession: string, f: typeof fetch = fetch): Promise<SourceFile> {
  const clean = accession.trim().toUpperCase();
  if (!UNIPROT.test(clean)) throw new Error('A UniProt accession looks like P69905 or Q9Y6K9.');
  const meta = await f(`https://alphafold.ebi.ac.uk/api/prediction/${clean}`);
  if (!meta.ok) throw new Error(meta.status === 404 ? `AlphaFold has no model for ${clean}.` : `AlphaFold returned ${meta.status}.`);
  const list = await meta.json(); const entry = Array.isArray(list) ? list[0] : list;
  const fileUrl: string | undefined = entry?.pdbUrl || entry?.cifUrl;
  if (!fileUrl) throw new Error(`AlphaFold has no file for ${clean}.`);
  const r = await f(fileUrl); if (!r.ok) throw new Error(`AlphaFold file returned ${r.status}.`);
  const name = fileUrl.split('/').pop() || `AF-${clean}.pdb`;
  return { name, text: await r.text(), credit: `AlphaFold DB ${entry.modelEntityId ?? `AF-${clean}`} (Google DeepMind / EMBL-EBI)`, licence: 'CC-BY 4.0', url: `https://alphafold.ebi.ac.uk/entry/${clean}` };
}

/** Quick picks for people who don't have an ID in mind. */
export const STRUCTURE_PICKS: Array<{ label: string; kind: 'pdb' | 'alphafold'; id: string; about: string }> = [
  { label: 'Crambin', kind: 'pdb', id: '1CRN', about: 'A tiny plant protein; three disulfide bridges hold it together.' },
  { label: 'Hemoglobin', kind: 'pdb', id: '4HHB', about: 'Carries oxygen in blood: four chains, four heme groups.' },
  { label: 'DNA double helix', kind: 'pdb', id: '1BNA', about: 'The Dickerson dodecamer, a classic B-DNA structure.' },
  { label: 'Green fluorescent protein', kind: 'pdb', id: '1EMA', about: 'The jellyfish protein that glows; a barrel of beta sheets.' },
  { label: 'Hemoglobin α (predicted)', kind: 'alphafold', id: 'P69905', about: 'AlphaFold\'s prediction, coloured by its own confidence.' },
];

// ── BioModels (EMBL-EBI): curated, published SBML models. Curated models are CC0. ──

export interface BioModelHit { id: string; name: string; submitter?: string; url: string }

const BIOMODELS = 'https://www.biomodels.org';

export async function searchBioModels(query: string, f: typeof fetch = fetch, limit = 20): Promise<BioModelHit[]> {
  const q = query.trim(); if (!q) return [];
  // Curated models only: they are the ones checked to reproduce their paper.
  const url = `${BIOMODELS}/search?query=${encodeURIComponent(`${q} AND curationstatus:"Manually curated"`)}&numResults=${limit}&format=json`;
  const r = await f(url); if (!r.ok) throw new Error(`BioModels search returned ${r.status}.`);
  const d = await r.json();
  return (d.models ?? []).filter((m: any) => m.format === 'SBML' || !m.format).map((m: any) => ({ id: m.id, name: m.name, submitter: m.submitter, url: m.url ?? `${BIOMODELS}/${m.id}` }));
}

export async function fetchBioModel(id: string, f: typeof fetch = fetch): Promise<SourceFile> {
  const clean = id.trim().toUpperCase(); if (!/^(BIOMD|MODEL)\d{10}$/.test(clean)) throw new Error('A BioModels ID looks like BIOMD0000000012.');
  const files = await f(`${BIOMODELS}/model/files/${clean}?format=json`);
  if (!files.ok) throw new Error(files.status === 404 ? `No BioModels entry ${clean}.` : `BioModels returned ${files.status}.`);
  const list = await files.json();
  const main = (list.main ?? []).find((x: any) => /\.xml$/i.test(x.name)) ?? list.main?.[0];
  if (!main) throw new Error(`${clean} has no SBML file.`);
  const r = await f(`${BIOMODELS}/model/download/${clean}?filename=${encodeURIComponent(main.name)}`);
  if (!r.ok) throw new Error(`BioModels download returned ${r.status}.`);
  return { name: main.name, text: await r.text(), credit: `BioModels ${clean}`, licence: 'CC0 1.0', url: `${BIOMODELS}/${clean}` };
}
