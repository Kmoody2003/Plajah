# Open sources and the claim ledger (cells, brain, red blood cell)

Started 2026-10-04. Everything here is DRAFT. Nothing has had expert sign-off.

## What is here
- `data/brain_facts.json`, `hh_facts.json`, `synapse_glia_facts.json`: sourced facts for the brain, the Hodgkin-Huxley neuron, synapses and glia. Each fact has a verdict (SUPPORTED, PARTLY, NOT_FOUND), the URL a reviewer opened, and a short quote as relayed by the fetch tool.
- `data/cells_tranche1.json`, `cells_tranche2.json`: 54 human cell types with function, signature structures, a process worth simulating, and difficulty. Sizes and nucleus are mostly missing and are marked.
- `data/evidence-bundle.js`: the above merged into sources, ledger rows and a cell registry, as used by the Brain Atlas artifact.
- `data/hodgkin-huxley-engine.js`: the multi-compartment axon engine, tested against known resting gating values, all-or-none firing and propagation speed.

## License warning (read before reusing anything)
OpenStax Anatomy and Physiology 2e is **CC BY-NC-SA 4.0** (confirmed on the book preface and first page). It cannot be republished under the planned CC BY-SA 4.0 open-curriculum export or in a commercial product, and its pages forbid use in AI systems without OpenStax's written permission.
Use OpenStax to check facts and cite it. Do not copy its text or figures. Write fresh wording.
Other licenses were reported by reviewers from page summaries and must be re-verified before a legal decision. See the Source library tab in the Brain Atlas.

## Rules carried over from the content-integrity pipeline
- A claim is "read" only if a page was opened. Memory does not count.
- Verifiers reported quotes through a summarising fetch tool, so every quote must be re-checked against the raw page before it is published verbatim.
- Disagreement between sources (for example the carbon dioxide transport split) is shown on screen, not hidden.

## Known gaps (still not verified on an opened page)
Hodgkin-Huxley constants (120, 36, 0.3, reversal potentials, 6.3 C, Q10 = 3), Nernst and Goldman concentrations and the 0.04 permeability ratio, the Bohr coefficient -0.48, heme geometry distances, the Haldane equation, brain energy share (20 percent), cortical thickness and layers, cranial nerve count, the number of human cell types, most cell sizes.
Fetch tools were blocked on NCBI Bookshelf, PubMed and some PMC pages. A person with a browser can read these, or use Europe PMC full text.

## Next steps
1. Open the original Hodgkin and Huxley 1952 paper (PMC1392413) in a browser and confirm the constants and the 18.5 C velocity.
2. Name an expert reviewer for each module and record sign-off in the ledger.
3. Map ledger rows into `scripts/content` claim files so the blind-verifier pipeline can run on them.
4. Replace OpenStax-only facts with a second source (PMC CC BY, or a reference text the reviewer holds).
