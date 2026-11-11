# Lorea Lexicon

Plajah's dictionary, thesaurus, etymology, slang and multilingual word engine. It lives in Lorea
(view `LOREA_LEXICON`, the **Lexicon** door on the Lorea home) and serves the rest of the platform.

## Chapters

| Chapter | What it shows | Source |
|---|---|---|
| Meaning | Senses by part of speech, usage labels (slang, archaic, US…), examples, sense-level synonyms, "since 14th c." dates, related/derived words | Wiktionary |
| Thesaurus | Constellation of synonyms, close words, opposites, broader/narrower, parts, associations, rhymes | Datamuse (WordNet) + Wiktionary |
| Origins | The journey timeline (PIE → … → today), manuscript etymology, roots, doublets, cognate fan coloured by meaning drift, descendants | Wiktionary |
| Across languages | Kindred & false friends cards, the meaning prism (how each language splits one word's senses), translation atlas with speech, Compare bench | Wiktionary + `compare.ts` |
| Slang | Community street shelf (add/vote/report), Wiktionary slang senses, Grose 1811 *Vulgar Tongue* | Members, Wiktionary, Project Gutenberg |
| Life of the word | 1800–2019 frequency in books with era bands, peak, trend sentence, dated senses | Google Books Ngram |

Kids Mode: Slang chapter hidden; explicit rows are always filtered server-side (`safe=1`).

## How meanings are compared (`services/lexicon/compare.ts`)

Deterministic and explainable, with no model call:

- **same / shifted / drifted / false-friend**: token overlap of English glosses, with the home word's
  synonyms as bridges. Shared origin comes from etymology chains, listed cognates, or same spelling in a
  sister language.
- Obsolete/archaic senses count a quarter toward today's verdict but are kept as an *echo*. Example:
  German *Gift* → "drifted… an old sense still remembers: *gift; something given*".
- A short gloss naming the other word is a translation equivalent (Spanish *regalo* = "present, gift").
  This never applies between identical spellings, which is where false friends hide.

## Platform API (`/api/lexicon`, `services/lexicon/handler.ts`)

`GET /entry?w=` · `/thesaurus?w=&lang=` · `/usage?w=&lang=` · `/slang?w=&safe=1` · `/suggest?q=` · `/today` ·
`/translate?w=&to=es,fr` · `/compare?a=&al=&b=&bl=` · signed in: `POST /slang`, `/slang/vote`, `/slang/report`,
`GET|POST /journal`.

Client: `services/lexicon/client.ts` (`lookup`, `translations`, `compare`, `openLexicon(word, {tab, lang})`).
Any surface can fire `plajah:openLexicon` {word, lang?, tab?}.

## Storage (Firestore, server-side REST, so no rules change)

- `lexiconCache/{v<parser>:<title>}`: parsed entry JSON, 30-day TTL. Bump `PARSER_VERSION` after parser changes.
- `lexiconSlang/{id}` (+ `/votes/{uid}`, `/reports/{uid}`, `/meta/votes`): three reports hide an entry.
- `users/{uid}/lexiconJournal/{word}`: saved words, synced across devices.

Failure rule: only Wiktionary's `missingtitle` means "no such word". Throttling and timeouts retry once,
then surface as 502 and are never cached. At most 4 Wiktionary fetches run at once per process.

## Licences

Wiktionary text is CC BY-SA 4.0 (attribution with revision link on every entry; derived text stays BY-SA).
Ngram data is CC BY 3.0. Grose 1811 is public domain. Datamuse is free with no key (≤100k requests/day).
Etymonline and Urban Dictionary are **not** used: both are copyrighted.

## Size and cost (measured 2026-11-10)

Parsed entry JSON: rare words 6–12 KB, everyday words 25–100 KB, giants with translation subpages
(*water*) about 300 KB. Gzip shrinks these about 4–5×.

| Approach | Storage | Rough monthly cost* |
|---|---|---|
| **Lazy cache (built)**: store only words people look up | 100k words ≈ 1.5 GB | under $1 storage; reads ≈ $0.30–0.60 per 1M lookups |
| Full mirror of every Wiktionary page (≈8M+) in Firestore | ≈ 40–60 GB | ≈ $8–12 storage + ≈ $15 one-time writes |
| Full mirror as gzipped shards in Firebase Storage | ≈ 10–15 GB | ≈ $0.30–0.40 |

*Approximate Google list prices; check the current sheet before budgeting.

The interactive experiences cost nothing per view. Every visual is drawn in the browser from the cached
entry, and comparisons are deterministic. An optional AI "story of the word" layer would be generated
once per word and cached: roughly $0.0005–0.002 per word on a Flash-class model, so about $50–200 for
100k words. Run it as a server job, not a local batch.

## Dev

- Lab: `node node_modules/vite/bin/vite.js --config lexicon-lab.vite.config.mjs` → http://127.0.0.1:3245/lexicon-lab.html?w=gift&tab=origins
  (`&kids=1` for Kids Mode). It runs the real handler with in-memory slang and journal stores.
- Tests: `npm run test:lexicon` (offline fixtures). Types: `tsc --noEmit -p tsconfig.lexicon.json`.
